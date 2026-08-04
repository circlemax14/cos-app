/**
 * SCRUM-640 — Habit Correlation Strip (placeholder).
 *
 * Renders a display-only Pearson-r strip beneath the wellbeing score
 * card. Backed by GET /v1/habits/correlation (min_sample_size=10 on
 * the server; rows with n<10 or r=null are already filtered out
 * server-side, so this component just picks the top 3 by |r|).
 *
 * Behavior:
 *   - Flag OFF (default) → renders null (dark-launch discipline;
 *     never claims layout space).
 *   - Flag ON, query loading → renders null (no CLS thrash for a
 *     "coming later" polish surface).
 *   - Flag ON, no rows meet threshold → renders null; the empty-state
 *     copy lives on the dedicated journal screen where it has room.
 *   - Flag ON, has rows → 3-row strip sorted by |r| desc + disclaimer.
 *
 * Visual polish deliberately deferred to Ken (see DESIGN.correlation
 * "display_shape") — the strip is data-testid stable and semantically
 * complete so his iteration can be layout-only.
 */

import React from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { useHabitCorrelation } from '@/hooks/use-habit-journal'
import { useHabitJournalFlag } from '@/hooks/use-habit-journal-flag'
import { useAccessibility } from '@/stores/accessibility-store'
import { Colors } from '@/constants/theme'

const MAX_ROWS = 3

interface HabitCorrelationStripProps {
  testID?: string
}

function formatR(r: number | null): string {
  if (r == null || Number.isNaN(r)) return '—'
  const sign = r >= 0 ? '+' : '−'
  return `${sign}${Math.abs(r).toFixed(2)}`
}

export function HabitCorrelationStrip({
  testID = 'habit-correlation-strip',
}: HabitCorrelationStripProps): React.JSX.Element | null {
  const flagEnabled = useHabitJournalFlag()
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']

  // Only fetch when flag is on. useHabitCorrelation already respects the
  // flag; passing `false` explicitly when flag is off keeps DevTools tidy.
  const { data } = useHabitCorrelation(30, flagEnabled)

  if (!flagEnabled) return null
  if (!data) return null

  const rows = (data.rows ?? [])
    .filter((r) => r.r != null && !Number.isNaN(r.r))
    .sort((a, b) => Math.abs((b.r ?? 0)) - Math.abs((a.r ?? 0)))
    .slice(0, MAX_ROWS)

  if (rows.length === 0) return null

  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel="Habit correlations, directional patterns from the last 30 days"
      style={[styles.container, { backgroundColor: colors.card as string, borderColor: colors.border as string }]}
    >
      <Text
        style={{
          color: colors.subtext as string,
          fontSize: getScaledFontSize(10),
          fontWeight: getScaledFontWeight(700) as any,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          marginBottom: 8,
        }}
      >
        HABITS × WELLBEING
      </Text>

      {rows.map((row) => (
        <View
          key={row.habitId}
          style={styles.row}
          testID={`${testID}-row-${row.habitId}`}
        >
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              color: colors.text as string,
              fontSize: getScaledFontSize(13),
              fontWeight: getScaledFontWeight(500) as any,
            }}
          >
            {row.label}
          </Text>
          <Text
            style={{
              color: colors.text as string,
              fontSize: getScaledFontSize(13),
              fontWeight: getScaledFontWeight(700) as any,
              marginLeft: 12,
              minWidth: 56,
              textAlign: 'right',
            }}
          >
            r={formatR(row.r)}
          </Text>
          <Text
            style={{
              color: colors.subtext as string,
              fontSize: getScaledFontSize(11),
              marginLeft: 10,
              minWidth: 40,
              textAlign: 'right',
            }}
          >
            n={row.n}
          </Text>
        </View>
      ))}

      <Text
        style={{
          color: colors.subtext as string,
          fontSize: getScaledFontSize(10),
          marginTop: 10,
          lineHeight: 14,
        }}
      >
        {data.disclaimer}
      </Text>
    </View>
  )
}

export default HabitCorrelationStrip

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
})
