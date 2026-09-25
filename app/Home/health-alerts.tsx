/**
 * COS-1112 / COS-1118 — Health Alerts detail.
 *
 * The tap-through from the corner emblem. Ken: "the yellow steers you to that
 * list and helps you identify exactly what is critical, what's at the moderate
 * bubble", and "when you press on the i it gives you the references, so people
 * see that you're not just pulling a rabbit out of a hat."
 *
 * The screen answers three questions in order:
 *   1. what is firing, worst first
 *   2. what was measured and is fine
 *   3. what we are NOT watching, and why
 *
 * Point 3 is not padding. A crisis indicator covering seven metrics while
 * looking like it covers Ken's full document would be actively misleading, and
 * the patient has no way to know the difference unless we say so.
 *
 * COS-1118 — the top bar is a three-cell row: back button, title, and a spacer
 * the SAME WIDTH as the button. The spacer is what centres the title on the
 * screen rather than in the space left over beside the arrow; without it the
 * heading sits visibly right of centre, which is what Vishal saw.
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
import { MedicalAlertIcon } from '@/components/ui/medical-alert-icon'
import {
  ALERT_COLOR,
  SOURCES,
  ALERT_COLOR_UNKNOWN,
  PENDING_THRESHOLDS,
  UNMONITORED,
  alertColor,
  alertShouldFlash,
  alertWord,
} from '@/lib/health-alert-rules'
import type { AlertVerdict } from '@/lib/health-alert-rules'

type Themed = (typeof Colors)['light']

/** Width of the back button, mirrored on the right so the title centres. */
const NAV_SLOT = 44

function Row({
  verdict,
  colors,
  fs,
  fw,
}: {
  verdict: AlertVerdict
  colors: Themed
  fs: (n: number) => number
  fw: (n: number) => string
}): React.JSX.Element {
  const tint = ALERT_COLOR[verdict.level]
  return (
    <View style={[styles.row, { borderTopColor: colors.border }]}>
      <View style={[styles.dot, { backgroundColor: tint }]} />
      <View style={styles.rowBody}>
        <Text
          style={{
            color: colors.text,
            fontSize: fs(15),
            fontWeight: fw(600) as TextStyle['fontWeight'],
          }}
        >
          {verdict.metric}
        </Text>
        <Text style={{ color: colors.subtext, fontSize: fs(13), marginTop: 1 }}>
          {verdict.reason}
        </Text>
        {/* Ken's "i": the citation travels with the number it justifies. */}
        <Text
          style={{ color: colors.subtext, fontSize: fs(11), fontStyle: 'italic', marginTop: 3 }}
        >
          {verdict.source}
        </Text>
      </View>
    </View>
  )
}

function Card({
  title,
  colors,
  fs,
  fw,
  children,
}: {
  title: string
  colors: Themed
  fs: (n: number) => number
  fw: (n: number) => string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text
        style={{
          color: colors.text,
          fontSize: fs(13),
          fontWeight: fw(700) as TextStyle['fontWeight'],
          letterSpacing: 0.3,
          textTransform: 'uppercase',
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  )
}

export default function HealthAlertsScreen(): React.JSX.Element {
  /*
   * COS-1119 — Ken's "i".
   *
   * "When you press on the i it gives you the references, so people see that
   * you're not just pulling a rabbit out of a hat." Each row already carries
   * the source for its own number; this is the whole list in one place, which
   * is what he actually described.
   *
   * It lives in the right-hand nav slot — the cell that was an empty spacer
   * holding the title centred. One element doing two jobs, and the title stays
   * centred either way.
   */
  const [showSources, setShowSources] = React.useState(false)
  const { settings, getScaledFontSize: fs, getScaledFontWeight: fw } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const enabled = useHealthAlertsFlag()
  const { level, firing, clear, measuredCount, isLoading } = useHealthAlerts(enabled)

  const tint = isLoading ? ALERT_COLOR_UNKNOWN : alertColor(level)

  return (
    <AppWrapper>
      {/* Top bar — back, centred title, matching spacer. */}
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => dismissTo('/Home/plan')}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={10}
          style={styles.navSlot}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text
          style={{
            flex: 1,
            color: colors.text,
            fontSize: fs(18),
            fontWeight: fw(700) as TextStyle['fontWeight'],
            textAlign: 'center',
          }}
          accessibilityRole="header"
          numberOfLines={1}
        >
          Health Alerts
        </Text>
        {/* Mirrors the back button so the title centres on the SCREEN — and
            carries Ken's "i". */}
        <Pressable
          onPress={() => setShowSources((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showSources }}
          accessibilityLabel={
            showSources ? 'Hide where these thresholds come from' : 'Where these thresholds come from'
          }
          hitSlop={10}
          style={styles.navSlot}
        >
          <MaterialIcons
            name={showSources ? 'info' : 'info-outline'}
            size={22}
            color={colors.text}
          />
        </Pressable>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {!enabled ? (
          <Text style={{ color: colors.subtext, fontSize: fs(14) }}>
            Health alerts are not switched on for your account.
          </Text>
        ) : (
          <>
            {showSources && (
              <Card title="Where these thresholds come from" colors={colors} fs={fs} fw={fw}>
                {SOURCES.map((src) => (
                  <Text
                    key={src}
                    style={{ color: colors.subtext, fontSize: fs(12), marginTop: 8, lineHeight: fs(17) }}
                  >
                    {src}
                  </Text>
                ))}
                <Text
                  style={{
                    color: colors.subtext,
                    fontSize: fs(12),
                    marginTop: 10,
                    fontStyle: 'italic',
                    lineHeight: fs(17),
                  }}
                >
                  Every reading below also names the source it was judged against.
                </Text>
              </Card>
            )}

            {/* Hero — the answer, before any list. */}
            <View style={styles.hero}>
              <MedicalAlertIcon
                size={72}
                color={tint}
                hollow={colors.background}
                flashing={!isLoading && alertShouldFlash(level)}
              />
              <Text
                style={{
                  color: tint,
                  fontSize: fs(20),
                  fontWeight: fw(700) as TextStyle['fontWeight'],
                  marginTop: 10,
                  textAlign: 'center',
                }}
              >
                {isLoading ? 'Checking…' : alertWord(level)}
              </Text>
              {/*
                "Nothing flagged" over two metrics is a different statement from
                "nothing flagged" over twelve, and the patient is entitled to
                know which one they are reading.
              */}
              <Text
                style={{
                  color: colors.subtext,
                  fontSize: fs(13),
                  marginTop: 6,
                  textAlign: 'center',
                  paddingHorizontal: 8,
                  lineHeight: fs(19),
                }}
              >
                {isLoading
                  ? 'Reading your most recent measurements.'
                  : measuredCount === 0
                    ? 'We have no recent readings to check. This is not a clear result — it means we have nothing to look at.'
                    : `Based on ${measuredCount} measure${measuredCount === 1 ? '' : 's'} with a recent reading.`}
              </Text>
            </View>

            {firing.length > 0 && (
              <Card title="Needs attention" colors={colors} fs={fs} fw={fw}>
                {firing.map((v) => (
                  <Row key={v.metric} verdict={v} colors={colors} fs={fs} fw={fw} />
                ))}
              </Card>
            )}

            {clear.length > 0 && (
              <Card title="Measured and in range" colors={colors} fs={fs} fw={fw}>
                {clear.map((v) => (
                  <Row key={v.metric} verdict={v} colors={colors} fs={fs} fw={fw} />
                ))}
              </Card>
            )}

            <Card title="Not covered by this alert" colors={colors} fs={fs} fw={fw}>
              {UNMONITORED.map((u) => (
                <View key={u.metric} style={[styles.row, { borderTopColor: colors.border }]}>
                  <View style={[styles.dot, { backgroundColor: colors.border }]} />
                  <View style={styles.rowBody}>
                    <Text style={{ color: colors.text, fontSize: fs(14) }}>{u.metric}</Text>
                    <Text style={{ color: colors.subtext, fontSize: fs(12), marginTop: 1 }}>
                      {u.why}
                    </Text>
                  </View>
                </View>
              ))}
            </Card>

            {PENDING_THRESHOLDS.length > 0 && (
              <Card title="Thresholds being confirmed" colors={colors} fs={fs} fw={fw}>
                {PENDING_THRESHOLDS.map((t) => (
                  <Text key={t} style={{ color: colors.subtext, fontSize: fs(12), marginTop: 8 }}>
                    {t}
                  </Text>
                ))}
              </Card>
            )}

            <Text
              style={{
                color: colors.subtext,
                fontSize: fs(12),
                fontStyle: 'italic',
                marginTop: 16,
                lineHeight: fs(18),
              }}
            >
              These are general adult thresholds, not personalised to you. They do not replace
              advice from your care team. If you feel unwell, contact your provider or emergency
              services.
            </Text>
          </>
        )}
      </ScrollView>
    </AppWrapper>
  )
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navSlot: {
    width: NAV_SLOT,
    height: NAV_SLOT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 48 },
  hero: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 14,
    marginTop: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    marginTop: 8,
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  rowBody: { flex: 1 },
})
