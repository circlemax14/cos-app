/**
 * COS-1112 — Health Alerts detail.
 *
 * The tap-through from the corner badge. Ken: "the yellow steers you to that
 * list and helps you identify exactly what is critical, what's at the moderate
 * bubble", and "when you press on the i it gives you the references, so people
 * see that you're not just pulling a rabbit out of a hat."
 *
 * So this screen answers three questions in order:
 *   1. what is firing, worst first
 *   2. what was measured and is fine
 *   3. what we are NOT watching, and why
 *
 * Point 3 is not padding. A crisis indicator covering seven metrics while
 * looking like it covers Ken's full document would be actively misleading, and
 * the patient has no way to know the difference unless we say so.
 */

import React from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View, type TextStyle } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'

import { AppWrapper } from '@/components/app-wrapper'

// Required of every leaf route — see tests/unit/route-error-boundary-coverage.
export { ErrorBoundary } from '@/components/RouteErrorBoundary'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import { useHealthAlerts } from '@/hooks/use-health-alerts'
import { useHealthAlertsFlag } from '@/hooks/use-health-alerts-flag'
import { dismissTo } from '@/lib/dismiss-to'
import {
  ALERT_COLOR,
  PENDING_THRESHOLDS,
  UNMONITORED,
  alertColor,
  alertWord,
} from '@/lib/health-alert-rules'
import type { AlertVerdict } from '@/lib/health-alert-rules'

function Row({
  verdict,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: {
  verdict: AlertVerdict
  colors: (typeof Colors)['light']
  getScaledFontSize: (n: number) => number
  getScaledFontWeight: (n: number) => string
}): React.JSX.Element {
  const tint = verdict.level === 'none' ? ALERT_COLOR.none : ALERT_COLOR[verdict.level]
  return (
    <View style={[styles.row, { borderColor: colors.border }]}>
      <View style={[styles.dot, { backgroundColor: tint }]} />
      <View style={styles.rowText}>
        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(15),
            fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
          }}
        >
          {verdict.metric}
        </Text>
        <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13) }}>
          {verdict.reason}
        </Text>
        {/* Ken's "i": the citation travels with the number it justifies. */}
        <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(11), fontStyle: 'italic' }}>
          {verdict.source}
        </Text>
      </View>
    </View>
  )
}

export default function HealthAlertsScreen(): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const enabled = useHealthAlertsFlag()
  const { level, firing, clear, measuredCount, isLoading } = useHealthAlerts()

  const tint = alertColor(level)

  return (
    <AppWrapper>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Pressable
          onPress={() => dismissTo('/Home/plan')}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.back}
          hitSlop={8}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </Pressable>

        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(22),
            fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
            marginBottom: 4,
          }}
          accessibilityRole="header"
        >
          Health alerts
        </Text>

        {!enabled ? (
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14) }}>
            Health alerts are not switched on for your account.
          </Text>
        ) : isLoading ? (
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14) }}>
            Checking your latest readings…
          </Text>
        ) : (
          <>
            <Text
              style={{
                color: tint,
                fontSize: getScaledFontSize(16),
                fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
                marginBottom: 16,
              }}
            >
              {alertWord(level)}
            </Text>

            {/* The honest headline. "Nothing flagged" over two metrics is a
                different statement from "nothing flagged" over twelve, and the
                patient is entitled to know which one they are reading. */}
            <Text
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(13),
                marginBottom: 16,
              }}
            >
              {measuredCount === 0
                ? 'We have no recent readings to check. This is not a clear result — it means we have nothing to look at.'
                : `Based on ${measuredCount} measure${measuredCount === 1 ? '' : 's'} with a recent reading.`}
            </Text>

            {firing.length > 0 && (
              <View style={styles.section}>
                <Text
                  style={[styles.h2, { color: colors.text, fontSize: getScaledFontSize(15) }]}
                >
                  Needs attention
                </Text>
                {firing.map((v) => (
                  <Row
                    key={v.metric}
                    verdict={v}
                    colors={colors}
                    getScaledFontSize={getScaledFontSize}
                    getScaledFontWeight={getScaledFontWeight}
                  />
                ))}
              </View>
            )}

            {clear.length > 0 && (
              <View style={styles.section}>
                <Text
                  style={[styles.h2, { color: colors.text, fontSize: getScaledFontSize(15) }]}
                >
                  Measured and in range
                </Text>
                {clear.map((v) => (
                  <Row
                    key={v.metric}
                    verdict={v}
                    colors={colors}
                    getScaledFontSize={getScaledFontSize}
                    getScaledFontWeight={getScaledFontWeight}
                  />
                ))}
              </View>
            )}

            <View style={styles.section}>
              <Text style={[styles.h2, { color: colors.text, fontSize: getScaledFontSize(15) }]}>
                Not covered by this alert
              </Text>
              {UNMONITORED.map((u) => (
                <View key={u.metric} style={[styles.row, { borderColor: colors.border }]}>
                  <View style={[styles.dot, { backgroundColor: colors.border }]} />
                  <View style={styles.rowText}>
                    <Text style={{ color: colors.text, fontSize: getScaledFontSize(14) }}>
                      {u.metric}
                    </Text>
                    <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12) }}>
                      {u.why}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            {PENDING_THRESHOLDS.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.h2, { color: colors.text, fontSize: getScaledFontSize(15) }]}>
                  Thresholds still being confirmed
                </Text>
                {PENDING_THRESHOLDS.map((t) => (
                  <Text
                    key={t}
                    style={{
                      color: colors.subtext,
                      fontSize: getScaledFontSize(12),
                      marginBottom: 6,
                    }}
                  >
                    {t}
                  </Text>
                ))}
              </View>
            )}

            <Text
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(12),
                fontStyle: 'italic',
                marginTop: 8,
              }}
            >
              These are general adult thresholds, not personalised to you. They do not
              replace advice from your care team. If you feel unwell, contact your
              provider or emergency services.
            </Text>
          </>
        )}
      </ScrollView>
    </AppWrapper>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 48 },
  back: { alignSelf: 'flex-start', marginBottom: 12 },
  section: { marginTop: 20, gap: 8 },
  h2: { fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  rowText: { flex: 1, gap: 2 },
})
