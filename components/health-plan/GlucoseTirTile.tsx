/**
 * SCRUM-648 — Glucose (TIR) compact tile.
 *
 * Renders a display-only Time-in-Range summary beneath the wellbeing
 * score / today-hero row in the Biological section of the
 * BiopsychosocialPlanScreen. Backed by GET /v1/patients/me/glucose/trend.
 *
 * Behavior:
 *   - Flag OFF (default) → renders null (dark-launch discipline;
 *     never claims layout space).
 *   - Flag ON, query loading → renders null (no CLS thrash for a
 *     "coming later" polish surface).
 *   - Flag ON, no data / sampleCount=0 → renders null (empty-state
 *     copy lives on the dedicated /Home/glucose screen where it has
 *     room; the tile is a "look, TIR is X%" glance-signal only).
 *   - Flag ON, has data → shows big TIR% figure + tiny
 *     "last 14d, n=X" subtext. Tap routes to /Home/glucose.
 *
 * PHI hygiene: NO timestamps, NO raw values, NO patient identifiers
 * in the tile body. Just aggregated TIR% + sample count.
 */

import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'

import { useCgmGlucoseFlag } from '@/hooks/use-cgm-glucose-flag'
import { useGlucoseTrend } from '@/hooks/use-cgm-glucose'
import { useAccessibility } from '@/stores/accessibility-store'
import { Colors } from '@/constants/theme'

const WINDOW_DAYS = 14

interface GlucoseTirTileProps {
  testID?: string
}

export function GlucoseTirTile({
  testID = 'glucose-tir-tile',
}: GlucoseTirTileProps): React.JSX.Element | null {
  const flagEnabled = useCgmGlucoseFlag()
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']

  // Only fetch when the flag is on. useGlucoseTrend already respects
  // the flag; passing `false` explicitly when flag is off keeps DevTools tidy.
  const { data } = useGlucoseTrend(WINDOW_DAYS, flagEnabled)

  if (!flagEnabled) return null
  if (!data) return null

  const sampleCount = data.tir?.sampleCount ?? data.series.length
  if (sampleCount === 0) return null
  // Also skip if the flag flipped ON but the server returned neither
  // a tir summary nor a series (defensive against edge cases from the
  // care-manager stub shape leaking into the patient variant).
  if (!data.tir && data.series.length === 0) return null

  const pct = data.tir ? Math.round(data.tir.pct) : 0

  return (
    <Pressable
      testID={testID}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`Blood glucose time in range, ${pct} percent, last ${WINDOW_DAYS} days`}
      onPress={() => router.push('/Home/glucose')}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: colors.card as string,
          borderColor: colors.border as string,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text
        style={{
          color: colors.subtext as string,
          fontSize: getScaledFontSize(10),
          fontWeight: getScaledFontWeight(700) as any,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        Glucose (TIR)
      </Text>
      <Text
        style={{
          color: colors.text as string,
          fontSize: getScaledFontSize(28),
          fontWeight: getScaledFontWeight(700) as any,
          lineHeight: getScaledFontSize(32),
        }}
      >
        {pct}%
      </Text>
      <Text
        style={{
          color: colors.subtext as string,
          fontSize: getScaledFontSize(11),
          marginTop: 4,
        }}
      >
        last {WINDOW_DAYS}d, n={sampleCount}
      </Text>
    </Pressable>
  )
}

export default GlucoseTirTile

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    marginBottom: 12,
  },
})
