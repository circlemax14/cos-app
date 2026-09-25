/**
 * COS-1112 / COS-1116 — the Health Alerts indicator.
 *
 * Ken, 2026-09-24: "put it up in the top of the page in the corner, large
 * enough that you can see… green when there are no alert-worthy conditions,
 * yellow if we're seeing movement, red if a variable reaches a critical stage.
 * Green and yellow no flash. Red can be a flashing colour."
 *
 * ─── HIS ARTWORK, HIS PLACEMENT ──────────────────────────────────────
 *
 * COS-1116: the mark is the medical-alert emblem Ken supplied, not the app's
 * own Health Status icon, and it sits top-right with a caption beneath it as
 * his mock-up shows. The emblem is deliberately not ours — it is the universal
 * one, which is the reason he chose it: a carer or a paramedic recognises it
 * without being taught.
 *
 * ─── WHY IT IS NOT A PAGE ────────────────────────────────────────────
 *
 * "I don't want to open up another tab because you already have vitals and red
 * flags… I think it should not be a page, I think it should be an icon." So
 * this opens a sheet, not a sixth tab.
 *
 * ─── THE CAPTION IS KEN'S, VERBATIM ──────────────────────────────────
 *
 * COS-1123 — "CRITICAL HEALTH ALERTS" in every state, exactly as his mock-up
 * captions it. Vishal, 2026-09-25: "let's call the alert CRITICAL HEALTH
 * ALERT — go to the above message from Ken."
 *
 * I had made it conditional, on the reasoning that the word "CRITICAL" over a
 * green mark contradicts itself. That was raised and overruled, and the
 * objection is weaker than it first looks: the caption NAMES the instrument,
 * it does not report a reading. A defibrillator cabinet is labelled for the
 * emergency it exists to serve, not for the state of the room.
 *
 * What carries the state is the smaller line below, which always spells it out
 * in words. That line is not optional: colour alone fails older patients,
 * glare and colour-blindness, and this is the last surface in the app where
 * that would be acceptable — a patient who cannot separate amber from green
 * would otherwise be told nothing at all.
 *
 * ─── THE GREY STATE ──────────────────────────────────────────────────
 *
 * `level === null` means nothing was measured and renders GREY, never green. A
 * crisis indicator showing a reassuring green to a patient with no readings
 * answers a question it was never asked. COS-1115: loading is grey too, and the
 * component never returns null — an indicator that is sometimes simply absent
 * teaches people that its absence means nothing.
 *
 * ─── RENDERING RISK ──────────────────────────────────────────────────
 *
 * This mounts react-native-svg + Animated in a screen BODY, outside ADR-0003's
 * envelope. The caller gates it on useHealthAlertsFlag so one SSM write removes
 * it without an OTA.
 */

import React from 'react'
import { Pressable, StyleSheet, Text, type TextStyle } from 'react-native'

import { MedicalAlertIcon } from '@/components/ui/medical-alert-icon'
import { useAccessibility } from '@/stores/accessibility-store'
import { Colors } from '@/constants/theme'
import {
  ALERT_COLOR_UNKNOWN,
  alertColor,
  alertShouldFlash,
  alertWord,
} from '@/lib/health-alert-rules'
import type { AlertLevel } from '@/lib/health-alert-rules'

export interface HealthAlertBadgeProps {
  level: AlertLevel | null
  /** How many metrics are currently above `none`. */
  firingCount: number
  isLoading: boolean
  onPress: () => void
}

export function HealthAlertBadge({
  level,
  firingCount,
  isLoading,
  onPress,
}: HealthAlertBadgeProps): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']

  const tint = isLoading ? ALERT_COLOR_UNKNOWN : alertColor(level)
  const flashing = !isLoading && alertShouldFlash(level)
  const state = isLoading ? 'Checking…' : alertWord(level)
  const caption = 'CRITICAL HEALTH ALERTS'

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Health alerts: ${state}${
        firingCount > 0 && !isLoading ? `, ${firingCount} flagged` : ''
      }. Tap for detail.`}
      hitSlop={10}
      style={({ pressed }) => [styles.wrap, { opacity: pressed ? 0.7 : 1 }]}
    >
      <MedicalAlertIcon size={44} color={tint} hollow={colors.background} flashing={flashing} />
      <Text
        style={{
          color: tint,
          fontSize: getScaledFontSize(9),
          fontWeight: getScaledFontWeight(800) as TextStyle['fontWeight'],
          letterSpacing: 0.3,
          marginTop: 3,
          textAlign: 'center',
        }}
        numberOfLines={2}
      >
        {caption}
      </Text>
      <Text
        style={{
          color: colors.subtext,
          fontSize: getScaledFontSize(9),
          textAlign: 'center',
        }}
        numberOfLines={1}
      >
        {firingCount > 0 && !isLoading ? `${firingCount} to review` : state}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    // Narrow enough that the two-word caption wraps rather than stretching the
    // header, wide enough that it never hyphenates.
    maxWidth: 112,
  },
})

export default HealthAlertBadge
