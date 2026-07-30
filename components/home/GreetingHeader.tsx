/**
 * components/home/GreetingHeader.tsx — ADR-0003 Phase 1 (Home Redesign)
 *
 * Time-of-day greeting header for the redesigned Home. Extracted from
 * the inline greeting code in HeroScoreBlock so the redesigned Home
 * can compose greeting + ScoreCardGrid without pulling in the entire
 * HeroScoreBlock's dot-row + composite scaffolding.
 *
 * PRIMITIVE ENVELOPE (iOS 26.5): View / Text / StyleSheet only.
 *
 * DATE COMPUTATION:
 *   - `new Date().getHours()` runs at render time. That's cheap and
 *     correct for the "greeting bucket" use case — if a user lingers
 *     on the screen across an hour boundary, the next parent re-render
 *     naturally picks up the new bucket. We deliberately do NOT wire
 *     a setInterval / setTimeout to auto-refresh — a wall-clock tick
 *     on this component is a battery cost with no user-visible win
 *     (the greeting only changes at three points per day).
 *   - Callers wanting deterministic tests can pass `nowHour` to
 *     override the computed hour.
 *
 * A11Y:
 *   - Single Text with `accessibilityRole="header"` so VoiceOver
 *     announces this as a page landmark on cold-mount.
 *   - `maxFontSizeMultiplier=1.5` protects the row from XXL Dynamic
 *     Type wrapping into three lines on iPhone SE.
 */

import React from 'react'
import { StyleSheet, Text, View } from 'react-native'

export interface GreetingHeaderProps {
  /** First name — trimmed and inlined. Empty / undefined → no name. */
  userFirstName?: string
  /**
   * Optional override for the hour of day (0-23). Enables deterministic
   * snapshot testing without wall-clock coupling. Falls back to
   * `new Date().getHours()`.
   */
  nowHour?: number
  /** Optional trailing subtext (e.g. "Wednesday, July 30"). */
  subtext?: string
}

/**
 * Pure hour → greeting. Kept exported for testability without any
 * RN dependency.
 */
export function greetingForHour(hour: number): string {
  if (!Number.isFinite(hour)) return 'Hello'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function GreetingHeader({
  userFirstName,
  nowHour,
  subtext,
}: GreetingHeaderProps): React.JSX.Element {
  const hour = typeof nowHour === 'number' ? nowHour : new Date().getHours()
  const greeting = greetingForHour(hour)
  const trimmed = (userFirstName ?? '').trim()
  const greetingText = trimmed ? `${greeting}, ${trimmed}.` : `${greeting}.`

  return (
    <View style={styles.wrap}>
      <Text
        accessibilityRole="header"
        maxFontSizeMultiplier={1.5}
        numberOfLines={2}
        style={styles.greeting}
      >
        {greetingText}
      </Text>
      {subtext ? (
        <Text
          accessibilityRole="text"
          maxFontSizeMultiplier={1.5}
          numberOfLines={1}
          style={styles.subtext}
        >
          {subtext}
        </Text>
      ) : null}
    </View>
  )
}

export default GreetingHeader

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  greeting: {
    // 22pt weight 400 — heavier than HeroScoreBlock's 15pt intro
    // because the redesigned Home doesn't have a 96pt composite number
    // below it to steal focal weight. The greeting IS the top-of-page
    // anchor here.
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '400',
    color: '#11181C',
    letterSpacing: -0.2,
  },
  subtext: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '400',
    color: '#687076',
    marginTop: 4,
  },
})
