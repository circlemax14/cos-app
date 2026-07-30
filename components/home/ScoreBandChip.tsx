/**
 * components/home/ScoreBandChip.tsx — ADR-0003 Phase 1 (Home Redesign)
 *
 * A tiny, WCAG-AA foreground/background chip that names a wellbeing
 * band ("Optimal" / "Developing" / "Foundational" / "Initial"). Reads
 * both colors from the ScoreBands token so a chip cannot render an
 * inaccessible contrast pair even by mistake — the tokens are the
 * contract, this file just applies them.
 *
 * PRIMITIVE ENVELOPE (iOS 26.5 hardening — ADR-0003):
 *   Allowed:    View / Text / StyleSheet
 *   Prohibited: Animated, LayoutAnimation, Portal, ActivityIndicator,
 *               gradient, blur, rotate transforms, Pressable.
 * The chip is decorative-informational; tap handling belongs to the
 * enclosing ScoreCard's Pressable so VoiceOver hits ONE actionable
 * node per card, not one-per-chip.
 *
 * A11Y:
 *   - Outer View is accessible so VoiceOver reads the chip as a single
 *     stop: "Band: Developing". Inner Text is hidden from a11y so the
 *     utterance doesn't fragment.
 *   - `maxFontSizeMultiplier=1.5` prevents Dynamic Type XXL from
 *     overflowing the chip into the neighbor card at the 320pt
 *     iPhone SE viewport. The band NAME never wraps — truncation with
 *     `numberOfLines=1` is preferable to a two-line chip that eats
 *     the sparkline row's space below it.
 */

import React from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { ScoreBands, type ScoreBandName } from '@/constants/design-system'

export interface ScoreBandChipProps {
  /** ScoreBands key. When undefined the chip renders nothing (returns
   *  null) so a loading/empty ScoreCard doesn't ship a bare
   *  placeholder pill. */
  band: ScoreBandName | undefined
}

export function ScoreBandChip({ band }: ScoreBandChipProps): React.JSX.Element | null {
  if (!band) return null
  const tokens = ScoreBands[band]

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Band: ${tokens.label}`}
      style={[styles.chip, { backgroundColor: tokens.bg }]}
    >
      <Text
        // Hidden from a11y — the outer View's label is the single
        // utterance. This mirrors the HeroScoreBlock composite pattern.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        // Cap at 1.5x so XXL Dynamic Type can't push the chip beyond
        // its parent's row width. The ScoreCard footer row assumes a
        // chip max height of ~26pt at 1.5x.
        maxFontSizeMultiplier={1.5}
        numberOfLines={1}
        style={[styles.label, { color: tokens.fg }]}
      >
        {tokens.label.toUpperCase()}
      </Text>
    </View>
  )
}

export default ScoreBandChip

// -------------------------------------------------------------------
// Styles — static, no transforms, no shadows. Padding chosen so a
// chip at 1.0x font scale is ~22pt tall (fits the ScoreCard footer)
// and at 1.5x is ~26pt (still fits, because line-height is bounded).
// -------------------------------------------------------------------

const styles = StyleSheet.create({
  chip: {
    // Horizontal pill. borderRadius: full via a large value so RN's
    // rounding math clamps to the chip's actual height.
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9999,
    alignSelf: 'flex-start',
  },
  label: {
    // 11pt uppercase — small enough to sit next to a delta number,
    // large enough to survive Dynamic Type. letterSpacing widens the
    // uppercase so it reads as a label, not a shouty word.
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
})
