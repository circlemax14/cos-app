/**
 * SCRUM-642 — Health Age home-surface tile.
 *
 * Pure primitive envelope (View / Text / Pressable / MaterialIcons /
 * StyleSheet) — iOS 26.5-hardened, no Animated, no LayoutAnimation,
 * no react-native-svg. Mirrors ReadinessScoreCard.tsx.
 *
 * FLAG DISCIPLINE:
 *   Parent is expected to gate on `useHealthAgeFlag()` BEFORE mounting,
 *   but this component ALSO returns null on flag=false as a defensive
 *   backstop so a stray mount can't leak the surface. Zero PHI is
 *   rendered on the tile — only the aggregate Health Age number,
 *   chronological age delta, and non-PHI band label.
 *
 * States rendered:
 *   - hidden           → flag OFF, OR (overall=null AND <3 fresh
 *                        components) → return null so no dead slot
 *   - insufficient-data → overall=null AND ≥3 fresh components →
 *                        "Add biomarker data to see your Health Age"
 *   - ready            → number + band chip + gap delta line
 *
 * Terminology (Legal): "Health Age" — NEVER "Biological Age".
 */

import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'

import type { HealthAgeBand, HealthAgeResult } from '@/services/api/health-age'

const MIN_FRESH_COMPONENTS_TO_SHOW = 3

/** Foreground/background tokens per band. Inlined so this component
 *  has no design-system dep that might not exist in every branch. */
const BAND_TOKENS: Record<HealthAgeBand, { fg: string; bg: string; label: string }> = {
  younger:    { fg: '#0F6B36', bg: '#E6F4EC', label: 'YOUNGER' },
  'on-track': { fg: '#0B6963', bg: '#E0F2F1', label: 'ON TRACK' },
  older:      { fg: '#8A5100', bg: '#FDF3E4', label: 'OLDER' },
}

export interface HealthAgeCardProps {
  /** Latest snapshot from useHealthAge(). Undefined while loading. */
  result: HealthAgeResult | undefined
  /** Whether the query is still resolving. */
  isLoading?: boolean
  /** Called on tap — parent routes to /Home/health-age. */
  onPress?: () => void
}

function countFreshComponents(result: HealthAgeResult | undefined): number {
  if (!result) return 0
  return result.components.filter((c) => c.status === 'fresh').length
}

function formatGap(gap: number | null): { label: string; direction: 'older' | 'younger' | 'same' | 'unknown' } {
  if (gap == null || !Number.isFinite(gap)) {
    return { label: '', direction: 'unknown' }
  }
  const rounded = Math.round(gap * 10) / 10
  if (Math.abs(rounded) < 0.1) return { label: 'On track with your age', direction: 'same' }
  if (rounded > 0) return { label: `${rounded.toFixed(1)} yrs older than actual`, direction: 'older' }
  return { label: `${Math.abs(rounded).toFixed(1)} yrs younger than actual`, direction: 'younger' }
}

function HealthAgeCardBase({ result, isLoading, onPress }: HealthAgeCardProps): React.JSX.Element | null {
  const freshCount = countFreshComponents(result)
  const overall = result?.overall ?? null

  // Collapse-when-empty rule (per design): keep the tile off the surface
  // entirely when we have neither a score NOR enough freshness to justify
  // a nudge to connect data.
  if (!isLoading && overall == null && freshCount < MIN_FRESH_COMPONENTS_TO_SHOW) {
    return null
  }

  const band = result?.band ?? null
  const tokens = band ? BAND_TOKENS[band] : undefined
  const gap = formatGap(result?.healthAgeGap ?? null)

  const isInsufficient = overall == null && freshCount >= MIN_FRESH_COMPONENTS_TO_SHOW

  const a11yLabel = isLoading
    ? 'Health Age loading'
    : isInsufficient
      ? 'Health Age. Add biomarker data to see your Health Age.'
      : typeof overall === 'number'
        ? `Health Age ${Math.round(overall)}${result?.chronologicalAge ? `, chronological age ${Math.round(result.chronologicalAge)}` : ''}${band ? `, ${band}` : ''}`
        : 'Health Age not available'

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Open Health Age details"
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.header}>
        <Text style={styles.label} numberOfLines={1}>HEALTH AGE</Text>
        <MaterialIcons
          name="hourglass-empty"
          size={16}
          color="#687076"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      </View>

      {isLoading && overall == null ? (
        <>
          <Text style={styles.emptyBig} maxFontSizeMultiplier={1.3}>—</Text>
          <Text style={styles.emptyHint} numberOfLines={2} maxFontSizeMultiplier={1.3}>
            Loading your Health Age…
          </Text>
        </>
      ) : typeof overall === 'number' ? (
        <>
          <View style={styles.scoreRow}>
            <Text style={styles.scoreNumber} maxFontSizeMultiplier={1.3}>{Math.round(overall)}</Text>
            <Text style={styles.scoreScale} maxFontSizeMultiplier={1.3}>yrs</Text>
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
          {gap.label ? (
            <Text style={styles.driver} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {gap.label}
            </Text>
          ) : null}
        </>
      ) : (
        // Insufficient-data path (≥3 fresh but still no overall). Push
        // the user toward hooking up more data — no PHI, no diagnosis
        // language, matches the Legal-approved framing.
        <>
          <Text style={styles.emptyBig} maxFontSizeMultiplier={1.3}>—</Text>
          <Text style={styles.emptyHint} numberOfLines={3} maxFontSizeMultiplier={1.3}>
            Add biomarker data to see your Health Age
          </Text>
        </>
      )}
    </Pressable>
  )
}

export const HealthAgeCard = React.memo(HealthAgeCardBase)
HealthAgeCard.displayName = 'HealthAgeCard'
export default HealthAgeCard

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
    marginLeft: 4,
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
})
