/**
 * BpsPlanFocusBanner (CHUNK 60, 2026-07-22) — soft callout that surfaces
 * the wellbeing focus signal on the BPS plan surface. Ken transcript:
 *   - "everything is elevating except that domain" — that domain becomes
 *     the plan's focus target
 *   - "the plan should be a way of improving those numbers"
 *   - "if the plan is not connected to the assessment data... the plan's
 *     not particularly useful"
 *
 * v1 SCOPE: strictly generic copy. NO prescriptive language
 * ("talk to your psychiatrist about medication issues" etc.) — that
 * surface is deferred to a future chunk gated on Ken sign-off on tone
 * and clinical guardrails. "Explore tasks below" is the safe v1 CTA.
 *
 * Rendered directly above the three SectionCards on the BPS surface.
 * Tap → scrolls the parent's ScrollView to the matching SectionCard.
 *
 * RENDER RULES (genuinely-null-when-absent — NOT the chunk 47/48 pattern
 * that reserves fixed placeholder height):
 *   - !enabled  → null (kill-switch off from the parent).
 *   - !focus    → null (all domains flat / all elevating together /
 *                        insufficient trend data / no assessment history).
 *
 * iOS 26.5 safe: only Pressable / View / Text / MaterialIcons /
 * StyleSheet. No Modal, no Animated, no ActivityIndicator, no gradient,
 * no rotate — same primitive envelope chunks 47/50/57/59 have proven
 * safe on iPhone 14 iOS 26.5.
 *
 * OTA-safe (JS-only, no native fingerprint change).
 */
import React from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'

import { Radii, Spacing } from '@/constants/design-system'
import {
  DOMAIN_CALLOUT_NAME,
  bpsToSection,
  type BpsDomain,
} from '@/lib/wellbeing-score'
import type { BiopsychosocialSectionKey } from './SectionCard'

type ColorMap = Record<string, string>

export interface BpsPlanFocusBannerProps {
  /** Kill-switch — parent passes `BPS_PLAN_FOCUS_SIGNAL_ENABLED`. When
   *  false, the banner renders null (compiles the whole surface out). */
  enabled: boolean
  /** The BpsDomain to focus on this week, or undefined. */
  focus: BpsDomain | undefined
  /** Parent-owned scroll-to callback. Fires with the matching
   *  BiopsychosocialSectionKey (never undefined — banner only mounts
   *  when focus is defined). Parent no-ops if the target hasn't laid
   *  out yet (matches meds/self-assessments discipline). */
  onPress: (target: BiopsychosocialSectionKey) => void
  colors: ColorMap
  isDark: boolean
  getScaledFontSize: (n: number) => number
  getScaledFontWeight: (n: number) => string | number
}

// Chunk 60 adversarial-verify major #1 fix: theme-aware palette.
// Previously hardcoded teal-on-teal-8% failed contrast on dark theme.
// Now light-mode uses the same soft teal surface, dark-mode uses a
// higher-alpha teal wash + brighter teal ink so the banner reads on a
// dark ScrollView background. Base teal #0D9488 matches the wellbeing
// card + PlanTierPill for tonal consistency across the plan surface.
const TEAL_LIGHT = {
  surface: '#0D948814',
  border: '#0D948833',
  ink: '#0F766E',
  copy: '#134E4A',
}
const TEAL_DARK = {
  surface: '#0D948833',
  border: '#0D948866',
  ink: '#5EEAD4',
  copy: '#CCFBF1',
}

export function BpsPlanFocusBanner({
  enabled,
  focus,
  onPress,
  colors: _colors,
  isDark,
  getScaledFontSize,
  getScaledFontWeight,
}: BpsPlanFocusBannerProps): React.JSX.Element | null {
  if (!enabled) return null
  if (!focus) return null

  const target = bpsToSection(focus)
  if (!target) return null

  const palette = isDark ? TEAL_DARK : TEAL_LIGHT
  const domainNoun = DOMAIN_CALLOUT_NAME[focus]
  // Chunk 60 adversarial-verify major #3 fix: banner copy no longer
  // promises "Explore tasks below" because the focus domain's
  // SectionCard may be empty (Bedrock returned no bullets for that
  // domain). Rewrote to purely navigational — "Tap to jump to your
  // {domain} section" is truthful regardless of what the section
  // ultimately renders. Prescriptive copy still deferred pending Ken
  // sign-off on clinical tone.
  const copy = `Focus this week: your ${domainNoun}. Tap to jump there.`
  const a11y = `${copy} Scrolls to the ${domainNoun} section.`

  return (
    <Pressable
      onPress={() => onPress(target)}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      android_ripple={{ color: palette.border }}
      style={({ pressed }) => [
        styles.banner,
        {
          backgroundColor: palette.surface,
          borderColor: palette.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <MaterialIcons
        name="center-focus-strong"
        size={18}
        color={palette.ink}
        style={styles.leadIcon}
      />
      <Text
        numberOfLines={2}
        style={{
          flex: 1,
          color: palette.copy,
          fontSize: getScaledFontSize(13),
          fontWeight: getScaledFontWeight(600) as any,
          lineHeight: getScaledFontSize(18),
        }}
      >
        {copy}
      </Text>
      <MaterialIcons
        name="chevron-right"
        size={18}
        color={palette.ink}
        style={styles.trailIcon}
      />
    </Pressable>
  )
}

export default BpsPlanFocusBanner

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radii.lg,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: Spacing.md,
  },
  leadIcon: {
    marginRight: 8,
    opacity: 0.9,
  },
  trailIcon: {
    marginLeft: 8,
    opacity: 0.7,
  },
})
