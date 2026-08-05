/**
 * components/home/ReadinessScoreCard.tsx — SCRUM-638
 *
 * Home surface tile: today's Readiness/Recovery score. Pure View / Text
 * / Pressable / MaterialIcons / StyleSheet — iOS 26.5 primitive
 * envelope. No Animated, no LayoutAnimation, no ActivityIndicator.
 *
 * States rendered:
 *   - hidden           → parent decides whether to mount (flag off /
 *                        HealthKit unavailable → don't mount at all)
 *   - no-data          → tile with "—" + subtle "Connect Health app"
 *                        CTA (no navigation wired yet — visible
 *                        affordance only)
 *   - pre-baseline     → "X of 14 days" progress hint
 *   - warming-up       → score visible with "learning your baseline"
 *                        caveat
 *   - ready            → score + band + top-driver line
 *
 * Tap: no-op today (v1 scope). Tap-to-explain is SCRUM-639.
 */

import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'

import type { ReadinessBand, ReadinessScore } from '@/lib/readiness-score'
import type { ReadinessTileUiState } from '@/hooks/use-readiness-derivation'

/** WCAG-AA fg/bg pairs per band (mirrors the ScoreBands system used on
 *  the home page's wellbeing row — inlined here to avoid a
 *  constants/design-system dep that may not exist in every branch). */
const BAND_TOKENS: Record<ReadinessBand, { fg: string; bg: string; label: string }> = {
  optimal:      { fg: '#0F6B36', bg: '#E6F4EC', label: 'OPTIMAL' },
  developing:   { fg: '#0B6963', bg: '#E0F2F1', label: 'DEVELOPING' },
  foundational: { fg: '#8A5100', bg: '#FDF3E4', label: 'FOUNDATIONAL' },
  initial:      { fg: '#B23A48', bg: '#FBE7E9', label: 'INITIAL' },
}

export interface ReadinessScoreCardProps {
  score: ReadinessScore
  onPress?: () => void
  /** SCRUM-639 — "Why?" affordance. Renders a small trailing chip on
   *  the score row when a composite is available. Tap fires this
   *  callback (parent decides whether to open the AI chat with a
   *  prefilled explain prompt). Omit to hide the affordance. */
  onExplain?: () => void
  /** Discriminated tile state from useReadinessDerivation. When
   *  omitted, the card falls back to inferring UI branches from
   *  `score.state` (legacy behaviour — collapses loading /
   *  disconnected / no-samples into one "Connect Apple Health"
   *  message). Prefer passing this. */
  uiState?: ReadinessTileUiState
  /** Called when the user taps the "Connect Apple Health" CTA on the
   *  disconnected empty state. Parent should route to
   *  `/Home/apple-health`. Only invoked when `uiState === 'disconnected'`. */
  onConnectHealth?: () => void
  /** DIAGNOSTIC — long-press the card to surface runtime state (dp.date
   *  format, byDate keys, today lookup). Parent shows an Alert with the
   *  JSON so the user can screenshot + share. Remove once root cause
   *  identified. */
  onLongPress?: () => void
}

function ReadinessScoreCardBase({
  score,
  onPress,
  onExplain,
  uiState,
  onConnectHealth,
  onLongPress,
}: ReadinessScoreCardProps): React.JSX.Element {
  const { composite, band, state, baselineDays, drivers } = score
  const tokens = band ? BAND_TOKENS[band] : undefined

  // Top-driver line — pick the metric with the highest OR lowest
  // subscore as the narrative anchor. Highest = tell them what's
  // supporting today; lowest = tell them what dragged the score down.
  // Pick whichever is further from 50 (stronger signal).
  const topDriver = React.useMemo(() => {
    if (drivers.length === 0) return undefined
    const sorted = [...drivers].sort((a, b) => Math.abs(b.subscore - 50) - Math.abs(a.subscore - 50))
    const first = sorted[0]
    // 2026-08-05 (Vishal) — registry expanded from 4 → 10 metrics.
    const metricLabel: Record<typeof first.metric, string> = {
      hrv: 'HRV',
      sleep: 'Sleep',
      restingHr: 'Resting HR',
      respRate: 'Breathing',
      steps: 'Steps',
      activeEnergy: 'Active kcal',
      exerciseMin: 'Exercise',
      walkingHr: 'Walking HR',
      spo2: 'Blood O₂',
      flights: 'Flights',
    }
    const dir = first.subscore >= 50 ? 'strong' : 'low'
    return `${metricLabel[first.metric]} looking ${dir}`
  }, [drivers])

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={
        state === 'ready' && typeof composite === 'number'
          ? `Today's readiness score, ${composite} out of 100${band ? `, ${band}` : ''}`
          : state === 'warming-up' && typeof composite === 'number'
            ? `Today's readiness score, ${composite}, still learning your baseline (${baselineDays} of 14 days)`
            : state === 'pre-baseline'
              ? `Readiness score is warming up. ${baselineDays} of 14 days collected.`
              : 'Readiness score not available yet'
      }
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.header}>
        <Text style={styles.label} numberOfLines={1}>READINESS</Text>
        <MaterialIcons
          name="favorite"
          size={16}
          color="#687076"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      </View>

      {typeof composite === 'number' ? (
        <>
          <View style={styles.scoreRow}>
            <Text style={styles.scoreNumber} maxFontSizeMultiplier={1.3}>{composite}</Text>
            <Text style={styles.scoreScale} maxFontSizeMultiplier={1.3}>/100</Text>
            {onExplain ? (
              <Pressable
                onPress={(e) => {
                  // Stop the outer card's onPress from also firing when
                  // the user taps the Why? chip.
                  e.stopPropagation()
                  onExplain()
                }}
                accessibilityRole="button"
                accessibilityLabel="Explain why my readiness score is what it is today"
                hitSlop={8}
                style={({ pressed }) => [styles.whyChip, pressed && { opacity: 0.6 }]}
              >
                <Text style={styles.whyChipLabel} maxFontSizeMultiplier={1.3}>Why?</Text>
              </Pressable>
            ) : null}
          </View>
          {tokens ? (
            <View
              accessible
              accessibilityRole="text"
              accessibilityLabel={`Band: ${tokens.label.toLowerCase()}`}
              style={[styles.chip, { backgroundColor: tokens.bg }]}
            >
              <Text style={[styles.chipLabel, { color: tokens.fg }]} numberOfLines={1}>
                {tokens.label}
              </Text>
            </View>
          ) : null}
          {topDriver ? (
            <Text style={styles.driver} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {topDriver}
              {state === 'warming-up' ? ` · learning (${baselineDays}/14 days)` : ''}
            </Text>
          ) : null}
        </>
      ) : state === 'pre-baseline' ? (
        <>
          <Text style={styles.emptyBig} maxFontSizeMultiplier={1.3}>—</Text>
          <Text style={styles.emptyHint} numberOfLines={2} maxFontSizeMultiplier={1.3}>
            Warming up · {baselineDays}/14 days
          </Text>
        </>
      ) : uiState === 'loading' ? (
        // Preference/query still hydrating — static dashes, no
        // accusation that HealthKit is disconnected. Fixes the
        // first-mount race where already-connected users saw
        // "Connect Apple Health" for the first ~1-2s of Home.
        <>
          <Text style={styles.emptyBig} maxFontSizeMultiplier={1.3}>—</Text>
          <Text style={styles.emptyHint} numberOfLines={2} maxFontSizeMultiplier={1.3}>
            Loading today&apos;s readings…
          </Text>
        </>
      ) : uiState === 'no-samples' ? (
        // Connected + query resolved but no HRV/Sleep/RHR/RespRate for
        // today. Common on iPhone-only users, or before the first
        // Apple Watch sync of the morning. Do NOT tell the user to
        // reconnect — they already did.
        <>
          <Text style={styles.emptyBig} maxFontSizeMultiplier={1.3}>—</Text>
          <Text style={styles.emptyHint} numberOfLines={2} maxFontSizeMultiplier={1.3}>
            Waiting for today&apos;s HRV, sleep, and heart-rate readings
          </Text>
        </>
      ) : uiState === 'disconnected' && onConnectHealth ? (
        // User hasn't opted in to Apple Health yet — tappable CTA
        // that routes to /Home/apple-health so the empty state is
        // actually recoverable (previously it was a dead-end string).
        <Pressable
          onPress={(e) => {
            e.stopPropagation()
            onConnectHealth()
          }}
          accessibilityRole="button"
          accessibilityLabel="Connect Apple Health to see today's readiness"
          hitSlop={4}
          style={({ pressed }) => [styles.connectCta, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.emptyBig} maxFontSizeMultiplier={1.3}>—</Text>
          <Text style={styles.emptyHintLink} numberOfLines={2} maxFontSizeMultiplier={1.3}>
            Connect Apple Health to see today&apos;s readiness
          </Text>
        </Pressable>
      ) : (
        // Fallback (uiState omitted, or 'disconnected' without an
        // onConnectHealth handler wired) — legacy copy so older
        // callers stay byte-identical.
        <>
          <Text style={styles.emptyBig} maxFontSizeMultiplier={1.3}>—</Text>
          <Text style={styles.emptyHint} numberOfLines={2} maxFontSizeMultiplier={1.3}>
            Connect Apple Health to see today&apos;s readiness
          </Text>
        </>
      )}
    </Pressable>
  )
}

export const ReadinessScoreCard = React.memo(ReadinessScoreCardBase)
ReadinessScoreCard.displayName = 'ReadinessScoreCard'
export default ReadinessScoreCard

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
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  scoreNumber: {
    fontSize: 42,
    lineHeight: 46,
    fontWeight: '800',
    color: '#11181C',
    letterSpacing: -1,
  },
  scoreScale: {
    fontSize: 14,
    fontWeight: '500',
    color: '#687076',
    marginLeft: 2,
  },
  whyChip: {
    marginLeft: 'auto',
    marginBottom: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
    backgroundColor: 'rgba(11, 105, 99, 0.10)',
  },
  whyChipLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0B6963',
  },
  chip: {
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9999,
  },
  chipLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  driver: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '500',
    color: '#687076',
  },
  emptyBig: {
    fontSize: 42,
    lineHeight: 46,
    fontWeight: '700',
    color: '#C7CACD',
    letterSpacing: -1,
  },
  emptyHint: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '500',
    color: '#687076',
  },
  emptyHintLink: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    color: '#0B6963',
    textDecorationLine: 'underline',
  },
  connectCta: {
    // Wraps the tappable disconnected empty state so the whole
    // dash + subtitle block is a single hit target.
    alignSelf: 'stretch',
  },
})
