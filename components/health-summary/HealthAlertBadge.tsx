/**
 * COS-1112 — the Health Alerts indicator.
 *
 * Ken, 2026-09-24: "put it up in the top of the page in the corner, large
 * enough that you can see… green when there are no alert-worthy conditions,
 * yellow if we're seeing movement, red if a variable reaches a critical stage.
 * Green and yellow no flash. Red can be a flashing colour."
 *
 * ─── WHY IT IS NOT A PAGE ────────────────────────────────────────────
 *
 * He was explicit: "I don't want to open up another tab because you already
 * have vitals and red flags… I think it should not be a page, I think it
 * should be an icon." So this is a badge that sits beside the screen title and
 * opens a sheet, not a sixth tab.
 *
 * ─── THE GREY STATE ──────────────────────────────────────────────────
 *
 * There is a fourth colour he did not ask for, and it is the one that matters
 * most. `level === null` means nothing was measured, and it renders GREY with
 * the words "Not enough data" — never green. A crisis indicator that shows a
 * reassuring green to a patient with no readings is worse than no indicator,
 * because it answers a question it never asked.
 *
 * ─── RENDERING RISK ──────────────────────────────────────────────────
 *
 * This mounts HealthStatusIcon (react-native-svg + Animated) in a screen BODY.
 * Proven in the tab bar, but the tab bar is outside ADR-0003's envelope and a
 * screen body is a different mount path. The caller gates this on
 * useHealthAlertsFlag so one SSM write removes it without an OTA.
 */

import React from 'react'
import { Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native'

import { HealthStatusIcon } from '@/components/ui/health-status-icon'
import { useAccessibility } from '@/stores/accessibility-store'
import { Colors } from '@/constants/theme'
import { alertColor, alertShouldFlash, alertWord } from '@/lib/health-alert-rules'
import type { AlertLevel } from '@/lib/health-alert-rules'

export interface HealthAlertBadgeProps {
  level: AlertLevel | null
  /** How many metrics are currently above `none`. Drives the count pill. */
  firingCount: number
  isLoading: boolean
  onPress: () => void
}

export function HealthAlertBadge({
  level,
  firingCount,
  isLoading,
  onPress,
}: HealthAlertBadgeProps): React.JSX.Element | null {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']

  // Never render a colour while the answer is still in flight — a green that
  // becomes red a second later is worse than a beat of nothing.
  if (isLoading) return null

  const tint = alertColor(level)
  const flashing = alertShouldFlash(level)
  const word = alertWord(level)

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Health alerts: ${word}${
        firingCount > 0 ? `, ${firingCount} flagged` : ''
      }. Tap for detail.`}
      hitSlop={8}
      style={({ pressed }) => [
        styles.wrap,
        { borderColor: tint, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <HealthStatusIcon size={26} color={tint} animated={flashing} />
      <View style={styles.text}>
        <Text
          style={{
            color: tint,
            fontSize: getScaledFontSize(12),
            fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
          }}
          numberOfLines={1}
        >
          {word}
        </Text>
        {firingCount > 0 ? (
          <Text
            style={{ color: colors.subtext, fontSize: getScaledFontSize(11) }}
            numberOfLines={1}
          >
            {firingCount} to review
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1.5,
    alignSelf: 'flex-end',
  },
  text: {
    // The word carries the state for anyone who cannot separate the colours.
    // Colour alone fails older patients, glare, and colour-blindness — and a
    // crisis indicator is the last place to rely on it.
    justifyContent: 'center',
  },
})

export default HealthAlertBadge
