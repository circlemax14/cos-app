/**
 * COS-1133 — the biopsychosocial summary at the top of Health Trends.
 *
 * Ken: "I'd like to apply these categories and variables to a biopsychosocial
 * structure for an AI summary of health trend data. Can we apply Claude to
 * this on the health trend page?"
 *
 * The three domain headings come back inside the prose, so they are split out
 * here and rendered as headings rather than left as bare lines — the model is
 * told to emit them on their own line precisely so this can.
 *
 * ─── WHY IT POSTS ────────────────────────────────────────────────────
 *
 * The biometric half of the summary lives on the device. Raw HealthKit values
 * deliberately never reach the backend, so the digest is built here from the
 * trends already on screen and sent with the request. Nothing new is fetched
 * to produce it.
 */

import React from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'

import { Colors } from '@/constants/theme'
import { Spacing } from '@/constants/design-system'
import { splitDomains } from '@/lib/health-trend-summary-format'

export interface TrendSummaryState {
  summary: string
  notMeasured: string[]
  loading: boolean
  error: boolean
}

export function HealthTrendSummaryCard({
  state,
  colors,
  fs,
  fw,
  onRetry,
}: {
  state: TrendSummaryState
  colors: (typeof Colors)['light']
  fs: (n: number) => number
  fw: (n: number) => number | string
  onRetry: () => void
}): React.JSX.Element | null {
  if (state.loading) {
    return (
      <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <View style={styles.row}>
          <ActivityIndicator size="small" color={colors.tint} />
          <Text style={{ color: colors.subtext, fontSize: fs(13), marginLeft: Spacing.sm }}>
            Putting your summary together…
          </Text>
        </View>
      </View>
    )
  }

  if (state.error || !state.summary) {
    return (
      <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Text style={{ color: colors.subtext, fontSize: fs(13), lineHeight: fs(19) }}>
          {/* Never "nothing to report" — that would read as a clinical finding. */}
          We could not put your summary together just now.
        </Text>
        <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="Try again" hitSlop={8}>
          <Text style={{ color: colors.tint, fontSize: fs(13), fontWeight: '700', marginTop: 6 }}>
            Try again
          </Text>
        </Pressable>
      </View>
    )
  }

  const sections = splitDomains(state.summary)

  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <View style={styles.row}>
        <MaterialIcons name="auto-awesome" size={fs(16)} color={colors.tint} />
        <Text
          style={{
            color: colors.text,
            fontSize: fs(13),
            fontWeight: fw(700) as TextStyle['fontWeight'],
            letterSpacing: 0.3,
            textTransform: 'uppercase',
            marginLeft: 6,
          }}
        >
          Your health trends
        </Text>
      </View>

      {sections.map((s, i) => (
        <View key={s.heading ?? `s${i}`} style={{ marginTop: i === 0 ? Spacing.sm : Spacing.md }}>
          {s.heading ? (
            <Text
              style={{
                color: colors.text,
                fontSize: fs(14),
                fontWeight: fw(700) as TextStyle['fontWeight'],
                marginBottom: 2,
              }}
            >
              {s.heading}
            </Text>
          ) : null}
          <Text style={{ color: colors.subtext, fontSize: fs(14), lineHeight: fs(21) }}>
            {s.body}
          </Text>
        </View>
      ))}

      <Text style={{ color: colors.subtext, fontSize: fs(11), fontStyle: 'italic', marginTop: Spacing.md }}>
        Written from your own records. It is not medical advice, and it does not replace your
        care team.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 14,
    marginBottom: Spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
})

export default HealthTrendSummaryCard
